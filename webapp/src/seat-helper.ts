import { t, Language } from './i18n'

export function translateSeat(lang: Language, seat: string): string {
  const seatMap: Record<string, string> = {
    'south': 'south',
    'north': 'north', 
    'east': 'east',
    'west': 'west'
  }
  const key = seatMap[seat] || seat
  return t(lang, key as any) || seat
}
