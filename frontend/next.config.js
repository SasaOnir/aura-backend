/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Esternalizza i pacchetti pesanti/native dal bundle server (API routes)
  // così non vengono bundlati da webpack (che può crashare per Prisma/argon2/native modules)
  serverExternalPackages: [
    '@nestjs/core',
    '@nestjs/common',
    '@nestjs/platform-express',
    '@nestjs/config',
    '@nestjs/jwt',
    '@nestjs/passport',
    '@prisma/client',
    '@prisma/adapter-neon',
    '@neondatabase/serverless',
    '@node-rs/argon2',
    'passport',
    'passport-jwt',
    'passport-local',
    'class-validator',
    'class-transformer',
    'express',
    'helmet',
    'cookie-parser',
    'reflect-metadata',
    'ws',
  ],
};
module.exports = nextConfig;
