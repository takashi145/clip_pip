/**
 * Text Fragments（#:~:text=）の URL を組み立てる。ブラウザの「選択箇所への
 * リンクをコピー」のurlと同じ仕組み
 */
export function buildTextFragmentUrl(url: string, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return url;

  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const existingHash = hashIndex === -1 ? '' : url.slice(hashIndex + 1);

  return `${base}#${existingHash}:~:text=${encodeFragmentText(trimmed)}`;
}

function encodeFragmentText(text: string): string {
  return encodeURIComponent(text).replace(/-/g, '%2D');
}
