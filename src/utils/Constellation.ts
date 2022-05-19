const ConstellationError = 0
const Aries = 1
const Taurus = 2
const Gemini = 3
const Cancer = 4
const Leo = 5
const Virgo = 6
const Libra = 7
const Scorpio = 8
const Sagittarius = 9
const Capricorn = 10
const Aquarius = 11
const Pisces = 12

export function parseConstellation(birthday: Date): i32 {
  let month = birthday.getUTCMonth() + 1
  let day = birthday.getUTCDate()
  if ((month == 3 && day >= 21) || (month == 4 && day <= 20)) {
    return Aries
  } else if ((month == 4 && day >= 21) || (month == 5 && day <= 20)) {
    return Taurus
  } else if ((month == 5 && day >= 21) || (month == 6 && day <= 21)) {
    return Gemini
  } else if ((month == 6 && day >= 22) || (month == 7 && day <= 22)) {
    return Cancer
  } else if ((month == 7 && day >= 23) || (month == 8 && day <= 22)) {
    return Leo
  } else if ((month == 8 && day >= 23) || (month == 9 && day <= 22)) {
    return Virgo
  } else if ((month == 9 && day >= 23) || (month == 10 && day <= 22)) {
    return Libra
  } else if ((month == 10 && day >= 23) || (month == 11 && day <= 21)) {
    return Scorpio
  } else if ((month == 11 && day >= 22) || (month == 12 && day <= 21)) {
    return Sagittarius
  } else if ((month == 12 && day >= 22) || (month == 1 && day <= 19)) {
    return Capricorn
  } else if ((month == 1 && day >= 20) || (month == 2 && day <= 18)) {
    return Aquarius
  } else if ((month == 2 && day >= 19) || (month == 3 && day <= 20)) {
    return Pisces
  } else {
    return ConstellationError
  }
}
