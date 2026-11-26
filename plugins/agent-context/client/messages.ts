import { defineTranslations } from "@getpaseo/plugin/client";
import en from "./locales/en.json" with { type: "json" };
import zhCN from "./locales/zh-CN.json" with { type: "json" };
import es from "./locales/es.json" with { type: "json" };
import ja from "./locales/ja.json" with { type: "json" };
import ko from "./locales/ko.json" with { type: "json" };
import zhTW from "./locales/zh-TW.json" with { type: "json" };

export const messages = defineTranslations({
  resources: { en, "zh-CN": zhCN, es, ja, ko, "zh-TW": zhTW },
});
