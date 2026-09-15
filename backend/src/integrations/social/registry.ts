import { SOCIAL_PLATFORMS, type SocialPlatformValue } from "../../constants/social.constant";
import { CAPABILITY_METHODS, type SocialCapability } from "./capabilities";
import { SocialProviderError } from "./errors";
import { BaseSocialProvider, type SocialOperations, type SocialProvider } from "./provider";
import { createDefaultSocialProviders } from "./providers";

/** Capabilities a provider declares but still inherits the "unsupported" default for. */
export const findUnimplementedCapabilities = (provider: SocialProvider): SocialCapability[] => {
  if (!(provider instanceof BaseSocialProvider)) return [];
  const defaults = BaseSocialProvider.prototype as unknown as SocialOperations;
  return [...provider.capabilities].filter((capability) => {
    const method = CAPABILITY_METHODS[capability];
    return provider[method] === defaults[method];
  });
};

/** Looks up the provider for each platform. One provider per platform. */
export class SocialProviderRegistry {
  private readonly providers = new Map<SocialPlatformValue, SocialProvider>();

  constructor(providers: SocialProvider[] = []) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: SocialProvider): this {
    if (this.providers.has(provider.platform)) {
      throw new Error(`A social provider for ${provider.platform} is already registered`);
    }
    const unimplemented = findUnimplementedCapabilities(provider);
    if (unimplemented.length > 0) {
      throw new Error(
        `${provider.displayName} declares capabilities it doesn't implement: ${unimplemented.join(", ")}`,
      );
    }
    this.providers.set(provider.platform, provider);
    return this;
  }

  has(platform: SocialPlatformValue): boolean {
    return this.providers.has(platform);
  }

  get(platform: SocialPlatformValue): SocialProvider {
    const provider = this.providers.get(platform);
    if (!provider) {
      throw new SocialProviderError(
        "NOT_CONFIGURED",
        `No integration is registered for ${platform}`,
        {
          platform,
        },
      );
    }
    return provider;
  }

  /** Registered providers in the standard platform order. */
  list(): SocialProvider[] {
    return SOCIAL_PLATFORMS.flatMap((platform) => {
      const provider = this.providers.get(platform);
      return provider ? [provider] : [];
    });
  }
}

let activeRegistry: SocialProviderRegistry | null = null;

/** The app-wide registry, created with the default providers on first use. */
export const getSocialProviderRegistry = (): SocialProviderRegistry => {
  activeRegistry ??= new SocialProviderRegistry(createDefaultSocialProviders());
  return activeRegistry;
};

/** Swaps the app-wide registry (tests). Returns a function that restores the previous one. */
export const setSocialProviderRegistry = (registry: SocialProviderRegistry): (() => void) => {
  const previous = activeRegistry;
  activeRegistry = registry;
  return () => {
    activeRegistry = previous;
  };
};
