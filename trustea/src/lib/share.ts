export async function shareLink(title: string, text: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw new Error('Could not open the share dialog. Please copy the link instead.');
    }
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('Sharing is not available in this browser. Copy the page address from your browser.');
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    throw new Error('Could not copy the share link. Copy the page address from your browser.');
  }
}
