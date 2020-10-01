const get = require('lodash/get')
const listIdAutocomplete = require('../autocomplete/list_id')

// SendGrid uses a custom "SGQL" query language for finding contacts. To protect us from basic
// injection attacks (e.g. "email = 'x@x.com' or email like '%@%'"), we can just strip all quotes
// from untrusted values.
const sgqlEscape = s => {
  return s.replace(/['"]/g, '')
}

module.exports = action =>
  action
    // TODO make these automatic
    .validatePayload(require('./payload.schema.json'))
    .autocomplete('list_id', listIdAutocomplete)

    .cachedRequest({
      ttl: 60,
      key: ({ payload }) => `${payload.email}-${payload.list_id}`,
      value: async (req, { payload }) => {
        const search = await req.post('marketing/contacts/search', {
          json: {
            query: `email = '${sgqlEscape(
              payload.email
            )}' AND CONTAINS(list_ids, '${sgqlEscape(payload.list_id)}')`
          }
        })
        return get(await search.body, 'result[0].id')
      },
      as: 'contactId'
    })

    .request(async (req, { payload, contactId }) => {
      if (contactId === null || contactId === undefined) return null
      return req.delete(
        `marketing/lists/${payload.list_id}/contacts?contact_ids=${contactId}`
      )
    })