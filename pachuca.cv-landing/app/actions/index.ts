import { connectToDB } from '@/lib/db'
import { defineAction } from 'astro:actions'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

export const server = {
  apply: defineAction({
    accept: 'form',
    handler: async (formData) => {
      try {
        const data = Object.fromEntries(formData.entries())
        const motivations = formData.getAll('motivation[]')

        const birthFile = formData.get('birth_document') as File | null
        const medicalFile = formData.get('medical_document') as File | null

        let medicalURL = null
        let birthURL = null

        if (birthFile) {
          const arrayBuffer = await birthFile.arrayBuffer()

          const buffer = Buffer.from(arrayBuffer)

          const uniqueName = `${crypto.randomUUID()}-${birthFile.name}`

          await s3.send(
            new PutObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME!,
              Key: uniqueName,
              Body: buffer,
              ContentType: birthFile.type,
            })
          )

          birthURL = `${process.env.R2_PUBLIC_URL}/${process.env.R2_BUCKET_NAME}/${uniqueName}`
        }

        if (medicalFile) {
          const arrayBuffer = await medicalFile.arrayBuffer()

          const buffer = Buffer.from(arrayBuffer)

          const uniqueName = `${crypto.randomUUID()}-${medicalFile.name}`

          await s3.send(
            new PutObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME!,
              Key: uniqueName,
              Body: buffer,
              ContentType: medicalFile.type,
            })
          )

          medicalURL = `${process.env.R2_PUBLIC_URL}/${process.env.R2_BUCKET_NAME}/${uniqueName}`
        }

        const document = {
          child_name: data.child_name,
          child_dob: data.child_dob,
          parent_name: data.parent_name,
          parent_relationship: data.parent_relationship,
          parent_email: data.parent_email,
          parent_phone: data.parent_phone,
          motivation: motivations,
          enjoyment_level: data.enjoyment_level,
          reaction_challenge: data.reaction_challenge,
          learning_attitude: data.learning_attitude,
          team_behavior: data.team_behavior,
          soccer_aspirations: data.soccer_aspirations,
          potential_challenges: data.potential_challenges,
          other_comments: data.other_comments,
          birthFile_url: birthURL,
          medicalFile_url: medicalURL,
          created_at: new Date(),
        }

        const db = await connectToDB()
        const collection = db.collection('applications')
        await collection.insertOne(document)

        return { success: true }
      } catch (err) {
        console.error(err)
        return { success: false }
      }
    },
  }),
}
