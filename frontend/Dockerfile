FROM node:24-alpine AS development
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci
COPY frontend ./frontend
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM development AS build
ARG VITE_PUBLIC_SITE_URL
ARG VITE_DEMO_EMAIL
ARG VITE_DEMO_PASSWORD
ENV VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL VITE_DEMO_EMAIL=$VITE_DEMO_EMAIL VITE_DEMO_PASSWORD=$VITE_DEMO_PASSWORD
RUN npm run build
FROM nginx:stable-alpine AS production
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/trusted-edge.conf /etc/nginx/trusted-edge.conf
EXPOSE 80
