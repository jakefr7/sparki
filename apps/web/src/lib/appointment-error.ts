/** Display actionable API validation errors without showing internal server failures. */
export async function appointmentError(response: Response, fallback: string): Promise<Error> {
  if (response.status === 403) {
    return new Error(
      'Your account does not have permission to manage appointments. Ask your clinic owner or receptionist for help.',
    );
  }
  if (response.status === 400 || response.status === 422) {
    const body = (await response.json().catch(() => null)) as {
      message?: unknown;
      fieldErrors?: Record<string, string[]>;
      formErrors?: string[];
    } | null;
    if (typeof body?.message === 'string') return new Error(body.message);
    const validation =
      body?.message && typeof body.message === 'object'
        ? (body.message as { fieldErrors?: Record<string, string[]>; formErrors?: string[] })
        : body;
    const fields = Object.entries(validation?.fieldErrors ?? {}).flatMap(([field, errors]) =>
      errors.map((error) => `${field.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${error}`),
    );
    const details = [...fields, ...(validation?.formErrors ?? [])];
    if (details.length) return new Error(details.join(' · '));
  }
  return new Error(fallback);
}
