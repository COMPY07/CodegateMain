// ES3 xss.
// Tainted html.

export default function Post({ params }: { params: { id: string } }) {
  const content = params.id;
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}
