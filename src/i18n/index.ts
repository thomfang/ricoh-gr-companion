import { Device } from "scripting"
import en, { type I18nData } from "./en"
import zh from "./zh"

export type AppLocale = "system" | "en" | "zh"

export function getI18n(locale: AppLocale = "system"): I18nData {
  const resolved = locale === "system" ? Device.systemLocale : locale
  return resolved.toLowerCase().startsWith("zh") ? zh : en
}
