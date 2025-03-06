import type { ServerResponse } from 'node:http'
import { Asset } from '../assets/asset.js'
import { enumerateAssets, getAsset } from '../assets/index.js'
import { CspConfig, mergeCsp } from '../lib/csp/index.js'
import {
  Html,
  LinkAttrs,
  MetaAttrs,
  cssCode,
  html,
  isLinkRel,
} from '../lib/html/index.js'
import { Locale } from '../lib/locale.js'
import {
  AuthorizationResultAuthorize,
  buildAuthorizeData,
} from './build-authorize-data.js'
import {
  Customization,
  LinkDefinition,
  buildCustomizationCss,
  buildCustomizationData,
} from './build-customization-data.js'
import { buildErrorPayload, buildErrorStatus } from './build-error-payload.js'
import {
  assetsToCsp,
  declareBackendData,
  sendWebPage,
} from './send-web-page.js'

// TODO: Add more in this list as translations are added in the PO files
const AVAILABLE_LOCALES = ['en', 'fr'] as const satisfies readonly Locale[]
type AvailableLocale = Locale & (typeof AVAILABLE_LOCALES)[number]
const isAvailableLocale = (v: unknown): v is AvailableLocale =>
  (AVAILABLE_LOCALES as readonly unknown[]).includes(v)

const HCAPTCHA_CSP = {
  'script-src': ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
  'frame-src': ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
  'style-src': ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
  'connect-src': ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
} as const satisfies CspConfig

export type SendPageOptions = {
  preferredLocales?: readonly string[]
}

export class OutputManager {
  readonly links?: readonly LinkDefinition[]
  readonly meta: readonly MetaAttrs[] = [
    { name: 'robots', content: 'noindex' },
    { name: 'description', content: 'ATProto OAuth authorization page' },
  ]
  readonly scripts: readonly (Asset | Html)[]
  readonly styles: readonly (Asset | Html)[]
  readonly csp: CspConfig

  constructor(customization: Customization) {
    this.links = customization.branding?.links

    // Note: building scripts/styles/csp here for two reasons:
    // 1. To avoid re-building it on every request
    // 2. To throw during init if the customization/config is invalid

    this.scripts = [
      declareBackendData('__availableLocales', AVAILABLE_LOCALES),
      declareBackendData(
        '__customizationData',
        buildCustomizationData(customization),
      ),
      // Last (to be able to read the "backend data" variables)
      getAsset('main.js'),
    ]

    this.styles = [
      // First (to be overridden by customization)
      getAsset('main.css'),
      cssCode(buildCustomizationCss(customization)),
    ]

    const customizationCsp = customization?.hcaptcha ? HCAPTCHA_CSP : undefined
    const assetsCsp: CspConfig = {
      'script-src': [...assetsToCsp(enumerateAssets('main.js'))],
      'style-src': [...assetsToCsp(enumerateAssets('main.css'))],
    }

    this.csp = mergeCsp(customizationCsp, assetsCsp)
  }

  async sendAuthorizePage(
    res: ServerResponse,
    data: AuthorizationResultAuthorize,
    options?: SendPageOptions,
  ): Promise<void> {
    const locale = negotiateLocale(
      data.parameters.ui_locales?.split(' ') ?? options?.preferredLocales,
    )

    return sendWebPage(res, {
      scripts: [
        declareBackendData('__authorizeData', buildAuthorizeData(data)),
        ...this.scripts,
      ],
      styles: this.styles,
      meta: this.meta,
      links: this.buildLinks(locale),
      htmlAttrs: { lang: locale },
      body: html`<div id="root"></div>`,
      csp: this.csp,
    })
  }

  async sendErrorPage(
    res: ServerResponse,
    err: unknown,
    options?: SendPageOptions,
  ): Promise<void> {
    const locale = negotiateLocale(options?.preferredLocales)

    return sendWebPage(res, {
      status: buildErrorStatus(err),
      scripts: [
        declareBackendData('__errorData', buildErrorPayload(err)),
        ...this.scripts,
      ],
      styles: this.styles,
      meta: this.meta,
      links: this.buildLinks(locale),
      htmlAttrs: { lang: locale },
      body: html`<div id="root"></div>`,
      csp: this.csp,
    })
  }

  buildLinks(locale: Locale) {
    return this.links
      ?.map(({ rel, href, title }: LinkDefinition): LinkAttrs | undefined =>
        isLinkRel(rel)
          ? typeof title === 'string'
            ? { href, rel, title }
            : { href, rel, title: title[locale] || title.en }
          : undefined,
      )
      .filter((v) => v != null)
  }
}

function negotiateLocale(desiredLocales?: readonly string[]): Locale {
  if (desiredLocales) {
    for (const locale of desiredLocales) {
      if (locale === '*') break // use default
      if (isAvailableLocale(locale)) return locale
    }
  }
  return 'en'
}
