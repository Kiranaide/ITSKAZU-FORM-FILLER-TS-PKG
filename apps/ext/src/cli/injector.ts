interface InjectOptions {
  frameworks: string[];
  port: number;
  toolbarPath: string;
  host?: string;
}

export function injectToolbar(html: string, options: InjectOptions): string {
  const { toolbarPath } = options;
  const scriptTag = `<script type="module" src="${toolbarPath}"></script>`;
  const bodyEnd = html.search(/<\/body\s*>/i);

  if (bodyEnd >= 0) {
    return `${html.slice(0, bodyEnd)}${scriptTag}${html.slice(bodyEnd)}`;
  }

  return `${html}${scriptTag}`;
}
