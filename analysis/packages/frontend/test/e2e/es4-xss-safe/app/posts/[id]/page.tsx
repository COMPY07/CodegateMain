// ES4 sanitized.
// DOMPurify applied.

import DOMPurify from "isomorphic-dompurify";

export default function Post({ params }: { params: { id: string } }) {
  const content = DOMPurify.sanitize(params.id);
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}
