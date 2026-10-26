// The one place that turns text into a file download. It runs only from a click
// handler (the user pressed Export); nothing is downloaded by itself. The text is
// written as a Blob, never as markup (SEC-2). v2's own copy of v1's helper.
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
