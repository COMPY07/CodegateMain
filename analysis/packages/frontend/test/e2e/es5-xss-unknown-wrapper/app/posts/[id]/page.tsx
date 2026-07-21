// Unknown sanitizer.

function sanitizeForLogs(value: string): string {
  return value;
}

export default function Post({ params }: { params: { id: string } }) {
  const content = sanitizeForLogs(params.id);
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}
