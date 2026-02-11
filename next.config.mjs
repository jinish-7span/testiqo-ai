/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["zod-to-json-schema", "openai", "ai"],
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
};

export default nextConfig;
