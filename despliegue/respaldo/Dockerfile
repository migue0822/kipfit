# Respaldos de la base: mismas herramientas de PostgreSQL que el servidor (17) + rclone para la nube.
FROM postgres:17
RUN apt-get update \
  && apt-get install -y --no-install-recommends rclone curl ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*
ENV RCLONE_CONFIG=/config/rclone/rclone.conf
COPY *.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh
ENTRYPOINT []
CMD ["programar.sh"]
