/** @type {import('next').NextConfig} */
const nextConfig = {
  // Для GramJS — не бандлить telegram на сервере, оставляем как external
  serverExternalPackages: ["telegram"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Убедимся что telegram не попадает в клиентский бандл и не дуплируется
      config.externals = [...(config.externals || []), "telegram"];
    } else {
      // На клиенте telegram не нужен (только на сервере в API routes)
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    return config;
  },
};
export default nextConfig;
