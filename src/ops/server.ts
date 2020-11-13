import '../aliases'
import express from 'express'
import { NotFound } from 'http-errors'
import ow from 'ow'
import core from '@/middleware/core'
import errorHandler from '@/middleware/error-handler'
import { startServer } from '@/boot'
import { PORT } from '@/config'
import asyncHandler from '@/lib/async-handler'
import { getDestinationBySlug } from '@/destinations'
import { controlPlaneService } from '@/services/control-plane-service'

const app = express()

app.disable('x-powered-by')

// Causes `req.ip` to be set to the `X-Forwarded-For` header value, which is set by the ELB
app.set('trust proxy', true)

// Endpoint used by ECS to check that the server is still alive
app.get('/health', (_req, res) => {
  res.status(204).end()
})

app.use(core)

app.use(express.json())

async function fetchDestinationSettings(authorization: string, destinationId: string): Promise<object> {
  const { error, data } = await controlPlaneService.getDestinationById(
    { authorization },
    {
      destinationId,
      showEncryptedSettings: true
    }
  )

  if (error) {
    throw error
  }

  if (!data?.destination.settings) {
    throw new NotFound('No destination with that id was found.')
  }

  return data.destination.settings
}

app.post(
  '/autocomplete',
  asyncHandler(async (req, res) => {
    const { destinationId, destinationSlug, action, field, mapping, page } = req.body

    ow(field, ow.string)
    ow(mapping, ow.optional.object)
    ow(page, ow.optional.string)

    let settings = req.body.settings

    if (destinationId) {
      settings = await fetchDestinationSettings(req.headers.authorization as string, destinationId)
    }

    ow(settings, ow.optional.object)

    const destinationDefinition = getDestinationBySlug(destinationSlug)

    ow(action, ow.string.oneOf(Object.keys(destinationDefinition.partnerActions)))

    const actionDefinition = destinationDefinition.partnerActions[action]

    try {
      const result = await actionDefinition.executeAutocomplete(field, {
        payload: mapping,
        settings,
        cachedFields: {},
        page
      })

      res.status(200).json({
        data: result.data,
        pagination: {
          nextPage: result.pagination.nextPage
        }
      })
    } catch {
      res.status(200).json({
        data: [],
        pagination: {}
      })
    }
  })
)

app.post(
  '/test-credentials',
  asyncHandler(async (req, res) => {
    const { destination, settings } = req.body

    ow(settings, ow.object)

    const destinationDefinition = getDestinationBySlug(destination)

    try {
      await destinationDefinition.testAuthentication(settings)

      res.status(200).json({ ok: true })
    } catch (error) {
      if (error.name === 'AggregateAjvError') {
        const fields: Record<string, string> = {}

        for (const fieldError of error) {
          const name = fieldError.path.replace('$.', '')
          fields[name] = fieldError.message
        }

        res.status(200).json({
          ok: false,
          error: 'Credentials are invalid',
          fields
        })

        return
      }

      res.status(200).json({
        ok: false,
        error: error.message
      })
    }
  })
)

app.post(
  '/test-action',
  asyncHandler(async (req, res) => {
    const { destinationId, destinationSlug, action, event, mapping } = req.body

    ow(destinationId, ow.optional.string)
    ow(destinationSlug, ow.string)
    ow(event, ow.object)
    ow(mapping, ow.object)

    let settings = req.body.settings

    if (destinationId) {
      settings = await fetchDestinationSettings(req.headers.authorization as string, destinationId)
    }

    ow(settings, ow.optional.object)

    const destinationDefinition = getDestinationBySlug(destinationSlug)

    ow(action, ow.string.oneOf(Object.keys(destinationDefinition.partnerActions)))

    const actionDefinition = destinationDefinition.partnerActions[action]

    try {
      const result = await actionDefinition.execute({
        settings,
        payload: event,
        mapping,
        cachedFields: {}
      })

      res.status(200).json({
        ok: true,
        response: JSON.stringify(result.pop()!.output || '', null, '\t')
      })
    } catch (error) {
      res.status(200).json({
        ok: false,
        response: error.name === 'HTTPError' ? error.response.rawBody.toString() : error.message
      })
    }
  })
)

app.use(errorHandler)

export default startServer(app, Number(PORT || 3001))