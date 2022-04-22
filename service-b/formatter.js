const opentracing = require('opentracing')

const tracer = opentracing.globalTracer()

function formatGreeting(req, res) {
  const span = tracer.startSpan('format-greeting', { childOf: req.span })
  const name = req.query.name
  span.log({ event: 'format', message: `formatting message remotely for name ${name}` })
  const response = `Hello from service-b ${name}!`
  span.finish()
  res.send(response)
}

module.exports = formatGreeting
