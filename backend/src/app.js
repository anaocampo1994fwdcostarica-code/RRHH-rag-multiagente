import cors from 'cors'
import crypto from 'node:crypto'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { notFound } from './middlewares/notFound.js'
import apiRouter from './routes/index.js'

const app = express()

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function csrfCookie(request, response, next) {
  if (!request.headers.cookie?.match(/(?:^|;\s*)csrf=([^;]+)/)) {
    const token = crypto.randomBytes(24).toString('base64url')
    response.setHeader('Set-Cookie', `csrf=${token}; Path=/; SameSite=Strict${env.nodeEnv === 'production' ? '; Secure' : ''}`)
  }
  next()
}

function csrfProtection(request, response, next) {
  if (!mutatingMethods.has(request.method)) return next()
  const origin = request.get('origin')
  if (!origin) return next()
  if (!env.corsOrigins.includes(origin)) return response.status(403).json({ error: 'Origin not allowed' })
  const token = request.get('x-csrf-token')
  const cookieToken = request.headers.cookie?.match(/(?:^|;\s*)csrf=([^;]+)/)?.[1]
  if (!token || !cookieToken || token !== cookieToken) return response.status(403).json({ error: 'CSRF validation failed' })
  next()
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", env.frontendUrl, ...(env.supabaseUrl ? [env.supabaseUrl] : [])],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}))
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    const error = new Error('Origin not allowed by CORS')
    error.statusCode = 403
    callback(error)
  },
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token'],
  optionsSuccessStatus: 204,
}))
app.use(express.json({ limit: '256kb' }))
app.use(csrfCookie)
app.use(csrfProtection)

app.use('/api', apiRouter)
app.use(notFound)
app.use(errorHandler)

export default app
