const express = require('express')
const opentracing = require('opentracing')

const app = express()
const port = 8080
const serviceName = process.env.SERVICE_NAME || 'service-a'

// Initialize the Tracer
const tracer = initTracer(serviceName)
opentracing.initGlobalTracer(tracer)

// Instrument every incomming request
app.use(tracingMiddleWare)

// To capture http error span
app.get('/error', (req, res) => {
  res.status(500).send('some error')
})

// Using the span inside a route handler
const hello = require('./hello')
app.get('/sayHello/:name', hello)

app.disable('etag')
app.listen(port, () => console.log(`Service ${serviceName} listening on http://localhost:${port}`))

function initTracer(serviceName) {
  const initJaegerTracer = require('jaeger-client').initTracerFromEnv
  const config = {
    serviceName: serviceName,
  }
  // Sampler set to const 1 to capture every request, should not do this for production
  // Other sampler types: https://www.jaegertracing.io/docs/1.7/sampling/
  config.sampler = { type: 'const', param: 1 }
  return initJaegerTracer(config)
}

function tracingMiddleWare(req, res, next) {
  const tracer = opentracing.globalTracer();
  const wireCtx = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers)

  // Creating our span with context from incoming request
  const span = tracer.startSpan(req.path, { childOf: wireCtx })

  // Use the log api to capture a log
  span.log({ event: 'request_received' })

  // Use the setTag api to capture standard span tags for http traces
  span.setTag(opentracing.Tags.HTTP_METHOD, req.method)
  span.setTag(opentracing.Tags.SPAN_KIND, opentracing.Tags.SPAN_KIND_RPC_SERVER)
  span.setTag(opentracing.Tags.HTTP_URL, req.path)

  // include trace ID in headers so that we can debug slow requests we see in
  // the browser by looking up the trace ID found in response headers
  const responseHeaders = {}
  tracer.inject(span, opentracing.FORMAT_HTTP_HEADERS, responseHeaders)
  res.set(responseHeaders)

  // add the span to the request object for any other handler to use the span
  Object.assign(req, { span })

  // finalize the span when the response is completed
  const finishSpan = () => {
    if (res.statusCode >= 500) {
      span.setTag(opentracing.Tags.SAMPLING_PRIORITY, 1)
      span.setTag(opentracing.Tags.ERROR, true)
      span.log({ event: 'error', message: res.statusMessage })
    }
    span.setTag(opentracing.Tags.HTTP_STATUS_CODE, res.statusCode)
    span.log({ event: 'request_end' })
    span.finish()
  }

  res.on('finish', finishSpan)
  next()
}