export const BOT_USERNAME = 'riamarketingaibot'

export function telegramDeepLink(profileId: string) {
  return `https://t.me/${BOT_USERNAME}?start=${profileId}`
}
