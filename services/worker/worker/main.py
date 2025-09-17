from worker import celery_app


def main() -> None:
    celery_app.worker_main(["worker", "--loglevel=info", "-E"])


if __name__ == "__main__":
    main()
