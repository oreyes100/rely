import { Db, MongoClient } from 'mongodb'

const uri = import.meta.env.MONGO_URI
const client = new MongoClient(uri)

let cachedDb: Db = null

export async function connectToDB() {
  if (cachedDb) return cachedDb

  try {
    await client.connect()
    const db = client.db('pcv')
    cachedDb = db
    return db
  } catch (err) {
    console.error('Error connecting to MongoDB:', err)
    throw err
  }
}
