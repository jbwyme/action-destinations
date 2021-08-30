import { createTestEvent, createTestIntegration } from '@segment/actions-core'
import { Settings } from '../generated-types'
import nock from 'nock'
import { generateTestData } from '../../../../../cli/src/lib/test-data'
import destination from '../index'

const testDestination = createTestIntegration(destination)

beforeAll(() => {
  // Disable external network requests
  nock.disableNetConnect()
  // But allow localhost connections so we can test local routes and mock servers.
  nock.enableNetConnect('127.0.0.1')

  if (!nock.isActive()) {
    nock.activate()
  }
})

describe('Testing snapshot for {{destination}} action:', () => {
  for (const actionSlug in destination.actions) {
    it(actionSlug, async () => {
      const action = destination.actions[actionSlug]
      const [eventData, settingsData] = generateTestData(destination, action)

      nock(/.*/).persist().get(/.*/).reply(200)
      nock(/.*/).persist().post(/.*/).reply(200)
      nock(/.*/).persist().put(/.*/).reply(200)

      const event = createTestEvent({
        properties: eventData
      })

      const responses = await testDestination.testAction(actionSlug, {
        event,
        settings: settingsData as Settings,
        mapping: event.properties,
        useDefaultMappings: false
      })

      const requestBody = responses[0].request.body
      if (requestBody) {
        expect(requestBody.toString()).toMatchSnapshot()
      }
    })
  }
})
