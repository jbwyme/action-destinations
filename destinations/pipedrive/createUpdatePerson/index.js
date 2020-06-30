const get = require('lodash/get')

module.exports = action => action
  // TODO make these automatic
  .validatePayload(require('./payload.schema.json'))

  .map(
    {
      person: {
        add_time: {
          '@timestamp': {
            timestamp: { '@path': '$.person.add_time' },
            format: 'YYYY-MM-DD HH:MM:SS'
          }
        }
      }
    },
    { merge: true }
  )
  .request(async (req, { payload }) => {
    const search = await req.get('persons/search', {
      searchParams: { term: payload.personIdentifier }
    })

    const personId = get(search.body, 'data.items[0].item.id')

    if (personId === undefined) {
      return req.post('persons', { json: payload.person })
    } else {
      const { add_time: x, ...person } = payload.person
      return req.put(`persons/${personId}`, { json: person })
    }
  })
