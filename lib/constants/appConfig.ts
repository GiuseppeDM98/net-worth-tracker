/**
 * Application Feature Flags and Configuration
 *
 * This file contains global configuration settings for the application,
 * including feature flags that can be controlled via environment variables.
 */

/**
 * Registration Configuration
 *
 * REGISTRATIONS_ENABLED: When set to false, blocks all new user registrations.
 * Existing users can still log in.
 *
 * REGISTRATION_WHITELIST_ENABLED: When true, only emails in the whitelist can register.
 * This works independently from REGISTRATIONS_ENABLED.
 *
 * REGISTRATION_WHITELIST: Comma-separated list of email addresses allowed to register
 * when REGISTRATION_WHITELIST_ENABLED is true.
 */
export const APP_CONFIG = {
  // When set to 'false' (string), blocks all new user registrations
  // Default: true (allows registrations)
  REGISTRATIONS_ENABLED: process.env.NEXT_PUBLIC_REGISTRATIONS_ENABLED !== 'false',

  // When set to 'true' (string), enables email whitelist for registration
  // Default: false (whitelist disabled)
  REGISTRATION_WHITELIST_ENABLED: process.env.NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED === 'true',

  // Comma-separated list of allowed email addresses
  // Example: "user1@example.com,user2@example.com"
  REGISTRATION_WHITELIST: (process.env.NEXT_PUBLIC_REGISTRATION_WHITELIST || '')
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0),
};

/**
 * Helper function to check if an email is allowed to register
 * @param email - The email address to check
 * @returns true if registration is allowed for this email
 */
export function isRegistrationAllowed(email: string): boolean {
  // If registrations are completely disabled, check whitelist
  if (!APP_CONFIG.REGISTRATIONS_ENABLED) {
    // If whitelist is enabled, check if email is in the list
    if (APP_CONFIG.REGISTRATION_WHITELIST_ENABLED) {
      return APP_CONFIG.REGISTRATION_WHITELIST.includes(email.toLowerCase());
    }
    // Otherwise, registrations are completely blocked
    return false;
  }

  // If registrations are enabled, check if whitelist is active
  if (APP_CONFIG.REGISTRATION_WHITELIST_ENABLED) {
    return APP_CONFIG.REGISTRATION_WHITELIST.includes(email.toLowerCase());
  }

  // Registrations are open to everyone
  return true;
}
