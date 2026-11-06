export function download(name: string, content: string | Uint8Array | Blob, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([typeof content === "string" ? content : (content as Uint8Array<ArrayBuffer>)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'archivo';
