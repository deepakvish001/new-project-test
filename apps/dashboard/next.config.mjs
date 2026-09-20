/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@bakaya/db", "@bakaya/ladder", "@bakaya/legal"],
  serverExternalPackages: ["pg"],
  typescript: { ignoreBuildErrors: false },
};
