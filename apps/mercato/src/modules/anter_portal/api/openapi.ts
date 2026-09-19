import { z } from 'zod'

export const anterPortalTag = 'AnterPortal'

export const anterPortalErrorSchema = z.object({
  error: z.string(),
})

export default anterPortalTag
