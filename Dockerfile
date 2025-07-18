# 1단계: 빌드 환경 (Builder Stage)
# Node.js 20 버전을 기반으로 빌드 환경을 설정합니다. 'alpine'은 가벼운 리눅스 버전입니다.
FROM node:20.9.1-alpine3.18 AS builder

# 컨테이너 내부에 작업 디렉토리를 생성합니다.
WORKDIR /app

# package.json과 package-lock.json을 먼저 복사합니다.
# (이 파일들이 변경되지 않으면 다음 npm install 단계는 캐시를 사용해 빠르게 넘어갑니다)
COPY package.json ./
COPY package-lock.json ./

# 의존성 패키지를 설치합니다.
RUN npm install

# 프로젝트의 모든 소스 코드를 복사합니다.
COPY . .

# 프로덕션용으로 앱을 빌드합니다.
RUN npm run build

# 2단계: 최종 실행 환경 (Final Stage)
# 가벼운 웹 서버인 Nginx를 기반으로 최종 이미지를 설정합니다.
FROM nginx:stable-alpine

# Builder 스테이지에서 빌드된 결과물(dist 폴더 안의 내용)을
# Nginx가 정적 파일을 제공하는 기본 경로로 복사합니다.
COPY --from=builder /app/dist /usr/share/nginx/html

# 컨테이너의 80번 포트를 외부에 노출시킵니다.
EXPOSE 80

# Nginx 웹 서버를 실행하는 기본 명령어를 설정합니다.
CMD ["nginx", "-g", "daemon off;"]
