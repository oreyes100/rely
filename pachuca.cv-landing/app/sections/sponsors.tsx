import { IconCircleArrowRightFilled } from '@tabler/icons-react'
import Image from 'next/image'
export default function Sponsors() {
  return (
    <div className='mb-20'>
      <div className='flex mt-30 mb-10'>
        <h1 className='text-3xl md:text-6xl text-amber-500 mx-auto font-special font-bold uppercase'>
          Patrocinadores
        </h1>
      </div>
      {/* <div className='flex justify-center mb-20 mx-10 gap-10'>
        <Image src='/Frame.png' alt='Frame' width={126} height={162} />
        <Image src='/Frame.png' alt='Frame' width={126} height={162} />
        <Image src='/Frame.png' alt='Frame' width={126} height={162} />
        <Image src='/Frame.png' alt='Frame' width={126} height={162} />
        <Image src='/Frame.png' alt='Frame' width={126} height={162} />
        <Image src='/Frame.png' alt='Frame' width={126} height={162} />
        <Image src='/Frame.png' alt='Frame' width={126} height={162} />
      </div> */}
      <div className='flex mt-5'>
        <div className='inline-flex items-center justify-center bg-theme-midnight gap-2 px-4 py-2 mx-auto rounded-full text-white border-2 border-theme-steelblue transition hover:scale-95'>
          Ver mas en el Blog <IconCircleArrowRightFilled />
        </div>
      </div>
    </div>
  )
}
