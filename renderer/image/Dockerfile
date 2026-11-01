FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-draw \
    python3 python3-pypdf python3-pil poppler-utils fonts-liberation \
    fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu-core \
    libseccomp2 util-linux && rm -rf /var/lib/apt/lists/* && fc-cache -f
RUN groupadd --system --gid 10001 render && useradd --system --uid 10001 --gid render --home-dir /tmp --shell /usr/sbin/nologin render
WORKDIR /opt/renderer
COPY --chmod=0444 renderer_impl.py input_policy.py locked_exec.py container_server.py ./
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LANG=C.UTF-8 LC_ALL=C.UTF-8
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/usr/bin/python3","-I","/opt/renderer/container_server.py"]
