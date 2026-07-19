import { createContext, useContext, useState, ReactNode } from 'react'

type FormData = {
  fullName: string
  phoneNumber: string
  email: string
  dream: string
  familyRelationship: string
  reasonForFootball: string
  favoriteThingFromFootball: string
  mistakeHandling: string
  losingFeeling: string
  teamworkReason: string
  teammateSupport: string
  noBallPassAction: string
  relationshipHandling: string
}

const defaultInputsData: FormData = {
  fullName: '',
  phoneNumber: '',
  email: '',
  dream: '',
  familyRelationship: '',
  reasonForFootball: '',
  favoriteThingFromFootball: '',
  mistakeHandling: '',
  losingFeeling: '',
  teamworkReason: '',
  teammateSupport: '',
  noBallPassAction: '',
  relationshipHandling: '',
}

type InputContext = {
  data: FormData
  updateField: (field: keyof FormData, value: string) => void
}

const FormContext = createContext<InputContext | undefined>(undefined)

export const FormProvider = ({ children }: { children: ReactNode }) => {
  const [data, setData] = useState<FormData>(defaultInputsData)

  const updateField = (field: keyof FormData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <FormContext.Provider value={{ data, updateField }}>
      {children}
    </FormContext.Provider>
  )
}

export const useForm = () => {
  const context = useContext(FormContext)

  return context
}
