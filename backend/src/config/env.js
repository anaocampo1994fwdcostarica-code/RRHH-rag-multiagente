import dotenv from 'dotenv'

dotenv.config()

const parsedPort = Number.parseInt(process.env.PORT ?? '3001', 10)

export const env = {
  port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3001,
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
}
