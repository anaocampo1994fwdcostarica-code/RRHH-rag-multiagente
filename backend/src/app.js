import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { notFound } from './middlewares/notFound.js'
import apiRouter from './routes/index.js'

const app = express()

app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.frontendUrl) {
      callback(null, true)
      return
    }

    const error = new Error('Origin not allowed by CORS')
    error.statusCode = 403
    callback(error)
  },
}))
app.use(express.json())

app.use('/api', apiRouter)
app.use(notFound)
app.use(errorHandler)

export default app
