use axum_server::accept::Accept;
use std::{
    future::{ready, Ready},
    io,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    net::TcpStream,
    sync::{OwnedSemaphorePermit, Semaphore},
};

#[derive(Clone)]
pub struct Connections(Arc<Semaphore>);

impl Connections {
    pub fn new() -> Self {
        Self(Arc::new(Semaphore::new(64)))
    }
}

impl<S> Accept<TcpStream, S> for Connections {
    type Stream = Connection;
    type Service = S;
    type Future = Ready<io::Result<(Self::Stream, Self::Service)>>;

    fn accept(&self, stream: TcpStream, service: S) -> Self::Future {
        ready((|| {
            if !super::private(stream.peer_addr()?.ip()) {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "Peer outside private network",
                ));
            }
            let permit = self
                .0
                .clone()
                .try_acquire_owned()
                .map_err(|_| io::Error::other("HTTPS connection limit reached"))?;
            Ok((
                Connection {
                    stream,
                    _permit: permit,
                },
                service,
            ))
        })())
    }
}

pub struct Connection {
    stream: TcpStream,
    _permit: OwnedSemaphorePermit,
}

impl AsyncRead for Connection {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.stream).poll_read(cx, data)
    }
}

impl AsyncWrite for Connection {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.stream).poll_write(cx, data)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.stream).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.stream).poll_shutdown(cx)
    }
}
