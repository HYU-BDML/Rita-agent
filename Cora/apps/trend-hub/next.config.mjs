/** @type {import('next').NextConfig} */
const nextConfig = {
  // data/ 와 mock/ 을 서버에서 직접 읽는다.
  outputFileTracingIncludes: { '/**': ['./mock/**', './data/**'] },
};
export default nextConfig;
