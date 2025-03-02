/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://192.168.0.20:5000/:path*'
            }
        ]
    },
    // 추가: 리다이렉트 방지
    async redirects() {
        return [];
    },
    // CORS 이슈 해결을 위한 헤더 추가
    async headers() {
        return [
            {
                source: '/api/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Origin', value: '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
                    { key: 'Access-Control-Allow-Headers', value: 'Content-Type' }
                ]
            }
        ];
    }
}

module.exports = nextConfig