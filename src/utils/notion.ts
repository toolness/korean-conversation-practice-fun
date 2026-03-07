/** Constructs the Notion page URL from a page ID. */
export function getNotionPageUrl(pageId: string): string {
  const idWithoutDashes = pageId.replace(/-/g, "");
  return `https://www.notion.so/${idWithoutDashes}`;
}
