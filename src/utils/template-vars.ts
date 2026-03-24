/**
 * Replace {{variable}} placeholders in template content.
 */
export function replaceTemplateVars(
  content: string,
  vars: Record<string, string>,
): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
