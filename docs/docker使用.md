🚀 使用方法
方式一:使用 Docker Compose (推荐)

# 构建并启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止容器
docker-compose down

方式二:使用 Docker 命令

# 构建镜像
docker build -t bigbanana-ai .

# 运行容器
docker run -d -p 3000:80 --name bigbanana-ai-app bigbanana-ai

# 查看日志
docker logs -f bigbanana-ai-app

# 停止容器
docker stop bigbanana-ai-app

