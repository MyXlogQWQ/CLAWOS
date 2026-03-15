电脑端
# 启动 ollama
(base) PS E:\Kenshinn> ollama stop qwen3.5:4b
(base) PS E:\Kenshinn> ollama stop qwen3.5:0.8b
(base) PS E:\Kenshinn> $env:OLLAMA_HOST = "0.0.0.0:11434"
(base) PS E:\Kenshinn> ollama serve

# ssh 到开发板， 这样才可以访问 gateway 18789
(base) PS E:\Kenshinn> ssh -v -L 18789:127.0.0.1:18789 -i "C:\Users\ranta\.ssh\id_rsa_raspberry" yunke@192.168.209.205

开发板
# 配置 gateway
