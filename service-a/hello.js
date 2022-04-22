const opentracing = require('opentracing')
const bent = require('bent')

const tracer = opentracing.globalTracer()

const sayHello = async (req, res) => {
  const span = tracer.startSpan('say-hello', { childOf: req.span })
  const name = req.params.name
  span.log({ event: 'name', message: `this is a log message for name ${name}` })

  const response = await formatGreetingRemote(name, span)
  span.setTag('response', response)
  span.finish()
  res.send(response)
}

const formatGreetingRemote = async (name, span) => {
  const service = process.env.SERVICE_FORMATTER || 'localhost'
  const servicePort = process.env.SERVICE_FORMATTER_PORT || '8081'
  const url = `http://${service}:${servicePort}/formatGreeting?name=${name}`
  const headers = {}
  tracer.inject(span, opentracing.FORMAT_HTTP_HEADERS, headers)
  const request = bent('string', headers)

  const response = await request(url)
  return response
}

module.exports = sayHello
