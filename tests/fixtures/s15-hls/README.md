# S15 HLS 隔离媒体

自行生成的 64 秒蓝色视频，无音轨、真实课程内容或外部下载。Playwright 通过本地路由返回清单和 MPEG-TS 字节，播放器使用实际 hls.js/MSE 加载，不模拟其内部事件。

生成命令（ffmpeg / libx264）：

```bash
ffmpeg -f lavfi -i 'color=c=blue:s=160x90:r=10:d=64' -c:v libx264 -pix_fmt yuv420p -g 20 -sc_threshold 0 -hls_time 2 -hls_list_size 0 -hls_segment_filename tests/fixtures/s15-hls/segment%02d.mpegts tests/fixtures/s15-hls/stream.m3u8
```

每片 2 秒；原日志只记录已加载分片，这份媒体不能证明服务器学习进度或真实课程编码兼容。
