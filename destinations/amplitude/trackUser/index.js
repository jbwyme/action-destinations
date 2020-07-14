// TODO convert 'time' to ms since epoch
// TODO convert 'session_id' to ms since epoch
//
module.exports = (action) => action
  .validatePayload(require('./payload.schema.json'))
  .request((req, { payload, settings }) => (
    req.post(
      'https://api2.amplitude.com/2/httpapi',
      {
        json: {
          api_key: settings.apiKey,
          events: [payload]
        }
      }
    )
  ))