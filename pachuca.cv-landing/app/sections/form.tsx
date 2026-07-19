import {
  IconFlame,
  IconHeart,
  IconMail,
  IconPhone,
  IconTrophy,
  IconUsers,
  IconCircleArrowLeftFilled,
  IconCircleArrowRightFilled,
  IconCircleCheckFilled,
} from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from '../context/Context'

const ContactInfo = () => {
  const { data, updateField } = useForm()
  return (
    <div className='flex flex-col w-full max-w-md p-4 relative border rounded-md bg-theme-moonstone/5 border-theme-rustwood'>
      <div className='flex items-center gap-2'>
        <div className='p-2 bg-theme-midnight rounded-md shadow-sm'>
          <IconUsers />
        </div>
        <h4 className='text-2xl font-bold'>Contact Information</h4>
      </div>
      <div className='flex flex-col items-center gap-2 mt-4 w-full'>
        <label className='flex flex-col gap-1 w-full'>
          <span>Full Name</span>
          <div className='relative'>
            <input
              placeholder='Your Name'
              value={data.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              className='p-2 bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full pl-8 outline-none focus:border-theme-rustwood'
            />
            <IconUsers className='absolute top-1/2 left-2 -translate-y-1/2 size-5 text-theme-rustwood' />
          </div>
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>Phone Number</span>
          <div className='relative'>
            <input
              placeholder='Your Phone Number'
              value={data.phoneNumber}
              onChange={(e) => updateField('phoneNumber', e.target.value)}
              className='p-2 bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full pl-8 outline-none focus:border-theme-rustwood'
            />
            <IconPhone className='absolute top-1/2 left-2 -translate-y-1/2 size-5 text-theme-rustwood' />
          </div>
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>Email Address</span>
          <div className='relative'>
            <input
              placeholder='Your Email'
              value={data.email}
              onChange={(e) => updateField('email', e.target.value)}
              className='p-2 bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full pl-8 outline-none focus:border-theme-rustwood'
            />
            <IconMail className='absolute top-1/2 left-2 -translate-y-1/2 size-5 text-theme-rustwood' />
          </div>
        </label>
      </div>
    </div>
  )
}

const AspirationsInfo = () => {
  const { data, updateField } = useForm()
  return (
    <div className='flex flex-col items-start w-full max-w-3xl p-4 relative border rounded-md bg-theme-moonstone/5 border-theme-rustwood'>
      <div className='flex items-center gap-2'>
        <div className='p-2 bg-theme-midnight rounded-md shadow-sm'>
          <IconHeart />
        </div>
        <h4 className='text-2xl font-bold'>Aspirations & Family</h4>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 w-full'>
        <label className='flex flex-col gap-1 w-full'>
          <span>What is your biggest dream?</span>
          <textarea
            placeholder='Tell us about your dreams...'
            value={data.dream}
            onChange={(e) => updateField('dream', e.target.value)}
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>How do you get along with your parents?</span>
          <textarea
            placeholder='Describe your relationship with your family...'
            value={data.familyRelationship}
            onChange={(e) => updateField('familyRelationship', e.target.value)}
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
      </div>
    </div>
  )
}

const MotivationsInfo = () => {
  const { data, updateField } = useForm()
  return (
    <div className='flex flex-col w-full max-w-3xl p-4 relative border rounded-md bg-theme-moonstone/5 border-theme-rustwood'>
      <div className='flex items-center gap-2'>
        <div className='p-2 bg-theme-midnight rounded-md shadow-sm'>
          <IconFlame />
        </div>
        <h4 className='text-2xl font-bold'>Motivation & Emotions</h4>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 w-full'>
        <label className='flex flex-col gap-1 w-full'>
          <span>Why did you choose football?</span>
          <textarea
            placeholder='Tell us why you chose football...'
            value={data.reasonForFootball}
            onChange={(e) => updateField('reasonForFootball', e.target.value)}
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>What do you like most about playing football?</span>
          <textarea
            placeholder='Share what you enjoy most about football...'
            value={data.favoriteThingFromFootball}
            onChange={(e) =>
              updateField('favoriteThingFromFootball', e.target.value)
            }
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>
            What do you do when something goes wrong in training or a match?
          </span>
          <textarea
            placeholder='How do you handle mistakes or errors...'
            value={data.mistakeHandling}
            onChange={(e) => updateField('mistakeHandling', e.target.value)}
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>How do you feel when you win a match? And when you lose?</span>
          <textarea
            placeholder='Describe your emotions after winning and losing...'
            value={data.losingFeeling}
            onChange={(e) => updateField('losingFeeling', e.target.value)}
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
      </div>
    </div>
  )
}

const TeamworkInfo = () => {
  const { data, updateField } = useForm()
  return (
    <div className='flex flex-col w-full max-w-3xl p-4 relative border rounded-md bg-theme-moonstone/5 border-theme-rustwood'>
      <div className='flex items-center gap-2'>
        <div className='p-2 bg-theme-midnight rounded-md shadow-sm'>
          <IconTrophy />
        </div>
        <h4 className='text-2xl font-bold'>Social Skills</h4>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 w-full'>
        <label className='flex flex-col gap-1 w-full'>
          <span>Do you like to play in a team? Why?</span>
          <textarea
            placeholder='Share your thoughts on team play...'
            value={data.teamworkReason}
            onChange={(e) => updateField('teamworkReason', e.target.value)}
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>How do you help teammates with difficulties?</span>
          <textarea
            placeholder='Describe how you support your teammates...'
            value={data.teammateSupport}
            onChange={(e) => updateField('teammateSupport', e.target.value)}
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>What do you do if a teammate doesn't pass you the ball?</span>
          <textarea
            placeholder='How do you handle this situation...'
            value={data.noBallPassAction}
            onChange={(e) => updateField('noBallPassAction', e.target.value)}
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
        <label className='flex flex-col gap-1 w-full'>
          <span>
            How do you feel playing with teammates you don't get along with?
          </span>
          <textarea
            placeholder='Describe your approach to challenging relationships...'
            value={data.relationshipHandling}
            onChange={(e) =>
              updateField('relationshipHandling', e.target.value)
            }
            className='p-2 h-32 resize-none bg-white/10 border-2 border-theme-moonstone/10 rounded-md w-full outline-none focus:border-theme-rustwood'
          />
        </label>
      </div>
    </div>
  )
}

export default function SignUpForm() {
  const { data } = useForm()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  const prevStep = useCallback(() => {
    setDirection(-1)
    setStep((prev) => prev - 1)
  }, [])
  const nextStep = useCallback(() => {
    setDirection(1)
    setStep((prev) => prev + 1)
  }, [])

  const handleSubmit = async () => {
    try {
      const res = await fetch('http://localhost:8080/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })

      if (!res.ok) {
        throw console.log('Submission failed')
      }
    } catch (err) {
      console.error('Error submitting form:', err)
    }
  }

  const components = [
    <ContactInfo />,
    <AspirationsInfo />,
    <MotivationsInfo />,
    <TeamworkInfo />,
  ]

  return (
    <>
      <div className='relative w-full max-w-5xl flex items-center justify-center overflow-hidden'>
        <AnimatePresence mode='wait'>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -100 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            {components[step]}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className='flex justify-between items-center gap-4 max-w-4xl container'>
        <button
          onClick={prevStep}
          className={`flex items-center justify-center transition gap-2 px-4 py-2 border-2 rounded-md border-theme-steelblue/70 text-gray-300 bg-white/10 ${
            step > 0 && 'hover:scale-95 cursor-pointer'
          }`}
        >
          <IconCircleArrowLeftFilled /> Previous
        </button>
        <button
          onClick={step < 3 ? nextStep : handleSubmit}
          className={`flex hover:scale-95 cursor-pointer items-center justify-center transition gap-2 px-4 py-2 border-2 rounded-md bg-theme-rustwood border-theme-rustwood ${
            step < 3
          }`}
        >
          {step < 3 ? (
            <span className='flex items-center gap-2'>
              Next <IconCircleArrowRightFilled />
            </span>
          ) : (
            <span className='flex items-center gap-2'>
              Finish <IconCircleCheckFilled />
            </span>
          )}
        </button>
      </div>
    </>
  )
}
