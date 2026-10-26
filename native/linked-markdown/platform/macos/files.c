/* Darwin ABI stays in compiled C; Java sees only fixed-width values and errno.
 * No shell, elevated service, pathname overwrite, or source content writes. */
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/attr.h>
#include <sys/xattr.h>
#include <sys/acl.h>
#include <sys/event.h>
#include <fcntl.h>
#include <unistd.h>
#include <dirent.h>
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <uuid/uuid.h>

static int fail(void){return -errno;}
int vf_private(int fd,int directory);
int vf_open(int parent,const char *name,int write,int create,int directory){
 int fd=openat(parent,name,(write?O_RDWR:O_RDONLY)|O_CLOEXEC|O_NOFOLLOW|O_NONBLOCK|(create?O_CREAT|O_EXCL:0)|(directory?O_DIRECTORY:0),0600);
 if(fd<0)return fail();struct stat s;if(fstat(fd,&s)<0){int e=fail();close(fd);return e;}
 if((directory&&!S_ISDIR(s.st_mode))||(!directory&&!S_ISREG(s.st_mode))){close(fd);return -EINVAL;}if(create){int result=vf_private(fd,directory);if(result<0){close(fd);return result;}}return fd;
}
int vf_close(int fd){return close(fd)<0?fail():0;}
int vf_stat(int fd,int64_t *v){struct stat s;if(fstat(fd,&s)<0)return fail();
 v[0]=s.st_dev;v[1]=s.st_ino;v[2]=s.st_birthtimespec.tv_sec;v[3]=s.st_birthtimespec.tv_nsec;v[4]=s.st_size;v[5]=s.st_nlink;
 v[6]=s.st_mtimespec.tv_sec;v[7]=s.st_mtimespec.tv_nsec;v[8]=s.st_uid;v[9]=s.st_gid;v[10]=s.st_mode;v[11]=s.st_flags;return 0;}
int vf_path(int fd,char *out){return fcntl(fd,F_GETPATH,out)<0?fail():0;}
int vf_volume(int fd,char *uuid,char *mount){struct statfs fs;if(fstatfs(fd,&fs)<0)return fail();
 if(strcmp(fs.f_fstypename,"apfs")||(fs.f_flags&MNT_LOCAL)==0||(fs.f_flags&MNT_RDONLY))return -ENOTSUP;
 struct attrlist a={.bitmapcount=ATTR_BIT_MAP_COUNT,.volattr=ATTR_VOL_INFO|ATTR_VOL_UUID};
 struct {uint32_t size;uuid_t id;} __attribute__((packed)) result;
 if(fgetattrlist(fd,&a,&result,sizeof(result),0)<0)return fail();if(result.size!=sizeof(result))return -EINVAL;
 uuid_unparse_lower(result.id,uuid);strlcpy(mount,fs.f_mntonname,1024);return 0;}
int vf_admit(int fd){struct stat s;if(fstat(fd,&s)<0)return fail();
 if(s.st_uid!=geteuid()||!S_ISREG(s.st_mode)||s.st_nlink!=1||s.st_flags||!(s.st_mode&S_IWUSR)||(s.st_mode&07000))return -ENOTSUP;
 ssize_t attrs=flistxattr(fd,NULL,0,0);if(attrs<0)return fail();if(attrs){if(attrs>65536)return -ENOTSUP;char names[65536];if(flistxattr(fd,names,sizeof(names),0)!=attrs)return -EAGAIN;for(ssize_t at=0;at<attrs;){size_t n=strnlen(names+at,(size_t)(attrs-at));if(n==(size_t)(attrs-at)||strcmp(names+at,"com.apple.provenance"))return -ENOTSUP;at+=(ssize_t)n+1;}}
 acl_t acl=acl_get_fd_np(fd,ACL_TYPE_EXTENDED);if(!acl)return errno==ENOENT?0:fail();acl_entry_t entry;int entries=acl_get_entry(acl,ACL_FIRST_ENTRY,&entry);acl_free(acl);if(entries==0)return -ENOTSUP;
 return 0;}
int vf_metadata(int fd,const int64_t *v){struct stat s;if(fstat(fd,&s)<0)return fail();if(s.st_nlink!=1)return -ENOTSUP;
 if((s.st_uid!=v[8]||s.st_gid!=v[9])&&fchown(fd,(uid_t)v[8],(gid_t)v[9])<0)return fail();
 if(fchmod(fd,(mode_t)(v[10]&0777))<0)return fail();
 struct attrlist a={.bitmapcount=ATTR_BIT_MAP_COUNT,.commonattr=ATTR_CMN_CRTIME};struct timespec birth={v[2],v[3]};
 if(fsetattrlist(fd,&a,&birth,sizeof(birth),0)<0)return fail();return fsync(fd)<0?fail():0;}
int vf_private(int fd,int directory){struct stat s;if(fstat(fd,&s)<0)return fail();if(s.st_uid!=geteuid())return -EPERM;acl_t acl=acl_init(0);if(!acl)return fail();int result=acl_set_fd_np(fd,acl,ACL_TYPE_EXTENDED);int error=errno;acl_free(acl);if(result<0&&error!=ENOENT)return -error;if(fchmod(fd,directory?0700:0600)<0)return fail();return 0;}
int vf_check_private(int fd){struct stat s;if(fstat(fd,&s)<0)return fail();if(s.st_uid!=geteuid()||(s.st_mode&0777)!=0700)return -EPERM;acl_t acl=acl_get_fd_np(fd,ACL_TYPE_EXTENDED);if(!acl)return errno==ENOENT?0:fail();acl_entry_t entry;int entries=acl_get_entry(acl,ACL_FIRST_ENTRY,&entry);acl_free(acl);return entries==0?-EPERM:0;}
int vf_read(int fd,void *out,int count,int64_t offset){ssize_t n=pread(fd,out,count,offset);return n<0?fail():(int)n;}
int vf_write(int fd,const void *bytes,int count,int64_t offset){ssize_t n=pwrite(fd,bytes,count,offset);return n<0?fail():(int)n;}
int vf_flush(int fd,int64_t size){if(ftruncate(fd,size)<0||fsync(fd)<0)return fail();return 0;}
/* A held inode alone cannot rename itself on Darwin. Check the named inode,
 * move exclusively, then verify the captured object before any publication.
 * A substituted occupant is retained as evidence and never overwritten. */
int vf_move(int fd,int from,const char *old,int to,const char *name){struct stat held,named;
 if(fstat(fd,&held)<0||fstatat(from,old,&named,AT_SYMLINK_NOFOLLOW)<0)return fail();
 if(held.st_dev!=named.st_dev||held.st_ino!=named.st_ino)return -ESTALE;
 if(renameatx_np(from,old,to,name,RENAME_EXCL)<0)return fail();
 if(fsync(from)<0||fsync(to)<0)return fail();
 if(fstatat(to,name,&named,AT_SYMLINK_NOFOLLOW)<0)return fail();
 return held.st_dev==named.st_dev&&held.st_ino==named.st_ino?0:-ESTALE;}
int vf_unlink(int parent,const char *name){return unlinkat(parent,name,0)<0?fail():0;}
/* Enumeration occurs on an independent descriptor, never Java path traversal. */
int vf_entries(int fd,char *buffer,int capacity){int copy=openat(fd,".",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(copy<0)return fail();DIR *d=fdopendir(copy);if(!d){close(copy);return fail();}
 int size=0;struct dirent *e;errno=0;while((e=readdir(d))){if(!strcmp(e->d_name,".")||!strcmp(e->d_name,".."))continue;
 int length=(int)strlen(e->d_name)+1;if(size+length>capacity){closedir(d);return -E2BIG;}memcpy(buffer+size,e->d_name,length);size+=length;}
 int error=errno;closedir(d);return error?-error:size;}
int vf_watch(int fd){int k=kqueue();if(k<0)return fail();fcntl(k,F_SETFD,FD_CLOEXEC);struct kevent event;
 EV_SET(&event,fd,EVFILT_VNODE,EV_ADD|EV_CLEAR,NOTE_WRITE|NOTE_DELETE|NOTE_RENAME|NOTE_ATTRIB|NOTE_REVOKE,0,NULL);
 if(kevent(k,&event,1,NULL,0,NULL)<0){int e=fail();close(k);return e;}return k;}
int vf_poll(int k){struct kevent event;struct timespec timeout={0,0};int n=kevent(k,NULL,0,&event,1,&timeout);return n<0?fail():n;}
