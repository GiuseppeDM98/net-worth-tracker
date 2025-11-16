import { NextRequest, NextResponse } from 'next/server';
import { isRegistrationAllowed } from '@/lib/constants/appConfig';

/**
 * POST /api/auth/check-registration
 *
 * Server-side validation endpoint to check if a user is allowed to register.
 * This provides a security layer that cannot be bypassed by client-side code manipulation.
 *
 * Request body:
 * {
 *   "email": "user@example.com"
 * }
 *
 * Response:
 * - 200: { allowed: true } - Registration is permitted
 * - 403: { allowed: false, message: "..." } - Registration is blocked
 * - 400: { error: "..." } - Invalid request
 * - 500: { error: "..." } - Server error
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { email } = body;

    // Validate email parameter
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required and must be a string' },
        { status: 400 }
      );
    }

    // Normalize email to lowercase for comparison
    const normalizedEmail = email.toLowerCase().trim();

    // Check if registration is allowed for this email
    const allowed = isRegistrationAllowed(normalizedEmail);

    if (!allowed) {
      console.warn(
        `[REGISTRATION_BLOCKED] Registration attempt blocked for email: ${normalizedEmail} at ${new Date().toISOString()}`
      );

      return NextResponse.json(
        {
          allowed: false,
          message: 'Le registrazioni sono attualmente chiuse o la tua email non è autorizzata.',
        },
        { status: 403 }
      );
    }

    // Registration is allowed
    return NextResponse.json({ allowed: true });
  } catch (error) {
    console.error('[REGISTRATION_CHECK_ERROR]', error);

    // Don't expose internal error details to the client
    return NextResponse.json(
      { error: 'Si è verificato un errore durante la verifica. Riprova più tardi.' },
      { status: 500 }
    );
  }
}
