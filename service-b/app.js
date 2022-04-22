const express = require('express')
const opentracing = require('opentracing')
const formatter = require('./formatter')
const initJaegerTracer = require('jaeger-client').initTracerFromEnv

const app = express()
const port = 8081
const serviceName = process.env.SERVICE_NAME || 'service-b'
const tracer = initTracer(serviceName)
opentracing.initGlobalTracer(tracer)

app.use(tracingMiddleWare)
app.get('/formatGreeting', formatter)
app.disable('etag')
app.listen(port, () => console.log(`Service ${serviceName} listening on http://localhost:${port}`))

function initTracer(serviceName) {
    const config = {
        serviceName: serviceName
    }
    config.sampler = { type: 'const', param: 1 }
    return initJaegerTracer(config)
}

function tracingMiddleWare(req, res, next) {
    const wireCtx = tracer.extract(opentracing.FORMAT_HTTP_HEADERS, req.headers)
    const span = tracer.startSpan(req.path, { childOf: wireCtx })
    span.log({ event: 'request_received' })
    span.setTag(opentracing.Tags.HTTP_METHOD, req.method)
    span.setTag(opentracing.Tags.SPAN_KIND, opentracing.Tags.SPAN_KIND_RPC_SERVER)
    span.setTag(opentracing.Tags.HTTP_URL, req.path)
    
    const responseHeaders = {}
    tracer.inject(span, opentracing.FORMAT_HTTP_HEADERS, responseHeaders)
    res.set(responseHeaders)
    Object.assign(req, { span })

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
