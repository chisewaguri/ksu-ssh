#define _GNU_SOURCE

#include <fcntl.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mount.h>
#include <unistd.h>

static void
die(const char *operation)
{
	perror(operation);
	exit(EXIT_FAILURE);
}

/*
 * Magisk and KernelSU boot services run in init's mount namespace, which has
 * no user storage. Android mounts /storage/emulated and /mnt/user only in the
 * per-user namespace that zygote and the su shell use. A process started from
 * the boot-service namespace therefore cannot see internal storage even as
 * root, and unshare() only copies the namespace it starts from. Join the
 * primary namespace first so storage is visible, then unshare so the private
 * devpts mount stays contained.
 *
 * A ROM that denies setns leaves SSH working without internal storage, which
 * is better than refusing to start.
 */
static void
join_primary_namespace(void)
{
	int fd;

	fd = open("/proc/1/ns/mnt", O_RDONLY | O_CLOEXEC);
	if (fd == -1) {
		perror("open /proc/1/ns/mnt");
		return;
	}
	if (setns(fd, CLONE_NEWNS) == -1)
		perror("setns /proc/1/ns/mnt");
	close(fd);
}

int
main(int argc, char **argv)
{
	if (argc < 2) {
		fprintf(stderr, "usage: %s command [argument ...]\n", argv[0]);
		return EXIT_FAILURE;
	}

	join_primary_namespace();

	if (unshare(CLONE_NEWNS) == -1)
		die("unshare");
	if (mount(NULL, "/", NULL, MS_REC | MS_PRIVATE, NULL) == -1)
		die("mount private root");
	if (mount("devpts", "/dev/pts", "devpts", MS_NOSUID | MS_NOEXEC,
	    "newinstance,ptmxmode=0666,mode=0620,gid=2000") == -1)
		die("mount private devpts");

	execv(argv[1], &argv[1]);
	die("exec");
}
